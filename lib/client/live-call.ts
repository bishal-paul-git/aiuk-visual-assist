"use client";

import { useEffect, useMemo, useReducer } from "react";
import {
  READY_INTERVAL_MS,
  callReducer,
  callStatusLabel,
  initialCall,
  randomId,
  routeSignal,
  type CallEvent,
  type CallRole,
  type CallState,
  type IceCandidateInit,
  type IceServer,
  type OfferSignal,
  type OutgoingSignal,
  type Signal,
} from "@/lib/media/live-call";
import type { Transport } from "./transport";

/**
 * Browser side of the live video call: one RTCPeerConnection driven by the
 * pure state machine in lib/media/live-call.ts. Media goes peer to peer (or via
 * TURN); nothing is recorded. When WebRTC is missing or keeps failing, the call
 * settles in "fallback" and the preview relay (snapshots) carries on.
 */

export function webRtcSupported(): boolean {
  return typeof window !== "undefined" && typeof window.RTCPeerConnection === "function";
}

export class LiveCallController {
  state: CallState;
  remoteStream: MediaStream | null = null;
  micOn = true;
  /** Agent: whether a microphone is being sent. */
  micAvailable = false;
  readonly peer = randomId();

  private pc: RTCPeerConnection | null = null;
  private pendingIce: IceCandidateInit[] = [];
  private iceServers: IceServer[] | null = null;
  private local: MediaStream | null = null;
  private ownsLocal = false;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReadyAt = 0;
  /** Bumped on stop, so a slow prepare() from an earlier call is discarded. */
  private generation = 0;
  private preparing = false;
  private prepared = false;
  private outbox: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly opts: { role: CallRole; sessionId: string; key: string; transport: Transport },
  ) {
    this.state = initialCall(opts.role, Date.now());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private apply(event: CallEvent) {
    const before = this.state;
    this.state = callReducer(before, event);
    if (this.state === before) return;
    const inCall = (s: CallState) => s.phase === "connecting" || s.phase === "live";
    // Leaving a call (failure, hang-up, ineligible) always tears the connection down.
    if (inCall(before) && !inCall(this.state)) this.closePc();
    if (this.state.phase === "waiting" && before.phase !== "waiting") this.lastReadyAt = 0;
    this.emit();
  }

  /** Start or stop according to the session (agent present, consent, camera on). */
  setEligible(eligible: boolean) {
    if (eligible === (this.state.phase !== "idle")) return;
    if (!eligible) {
      this.hangUp("ineligible");
      this.apply({ type: "eligibility", eligible: false, now: Date.now() });
      this.stop();
      return;
    }
    this.apply({ type: "eligibility", eligible: true, now: Date.now() });
    this.unsubscribe ??= this.opts.transport.subscribeSignals(this.opts.role, this.opts.key, (s) => void this.onSignal(s));
    if (!webRtcSupported()) {
      this.apply({ type: "unsupported", now: Date.now() });
      return;
    }
    if (!this.preparing) void this.prepare();
    this.timer ??= setInterval(() => this.tick(), 1000);
    this.tick();
  }

  /** Customer: the camera stream (or demo canvas) to send. Tracks are swapped in place during a call. */
  setLocalStream(stream: MediaStream | null) {
    if (this.opts.role !== "customer" || stream === this.local) return;
    this.local = stream;
    const pc = this.pc;
    if (!pc || !stream) return;
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      const next = kind === "video" ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
      if (next && t.sender.track !== next && (t.direction === "sendonly" || t.direction === "sendrecv")) void t.sender.replaceTrack(next).catch(() => {});
    }
  }

  toggleMic() {
    this.micOn = !this.micOn;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = this.micOn));
    this.emit();
  }

  retry() {
    this.apply({ type: "retry", now: Date.now() });
    this.tick();
  }

  /** Hang up and release everything. The controller can be started again (React strict mode remounts). */
  dispose() {
    this.setEligible(false);
    this.closePc();
    this.stop();
  }

  /** Send a hang-up for the current call (e.g. the page is closing). */
  hangUp(reason: string) {
    const s = this.state;
    if (s.callId && (s.phase === "connecting" || s.phase === "live")) this.send({ kind: "bye", peer: this.peer, callId: s.callId, reason });
  }

  // -------------------------------------------------------------------------

  private stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generation += 1;
    this.preparing = false;
    this.prepared = false;
    if (this.ownsLocal) {
      this.local?.getTracks().forEach((t) => t.stop());
      this.local = null;
    }
    this.ownsLocal = false;
    this.micAvailable = false;
  }

  /** ICE servers, and for the agent the microphone (receive-only if it is refused). */
  private async prepare() {
    const generation = this.generation;
    this.preparing = true;
    const servers = await this.opts.transport.rtcIceServers(this.opts.role, this.opts.key);
    if (generation !== this.generation) return;
    this.iceServers = servers;
    if (this.opts.role === "agent") {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (generation !== this.generation) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        mic.getAudioTracks().forEach((t) => (t.enabled = this.micOn));
        this.local = mic;
        this.ownsLocal = true;
        this.micAvailable = true;
      } catch {
        // No microphone or permission declined: the agent can still see and hear.
        if (generation !== this.generation) return;
      }
    }
    this.prepared = true;
    this.emit();
    this.tick();
  }

  private tick() {
    const now = Date.now();
    this.apply({ type: "tick", now });
    const s = this.state;
    if (this.opts.role === "agent" && s.phase === "waiting" && this.prepared && now - this.lastReadyAt >= READY_INTERVAL_MS) {
      this.lastReadyAt = now;
      this.send({ kind: "ready", peer: this.peer });
    }
  }

  private send(signal: OutgoingSignal) {
    // Strictly in order: an ICE candidate must never overtake its offer or answer.
    this.outbox = this.outbox.then(() => this.opts.transport.sendSignal(this.opts.role, this.opts.key, signal)).catch(() => false);
  }

  private async onSignal(msg: Signal) {
    // A customer whose browser cannot do WebRTC tells the agent, so it falls back straight away.
    if (this.state.phase === "fallback" && this.state.reason === "unsupported" && this.opts.role === "customer" && msg.kind === "ready") {
      this.send({ kind: "bye", peer: this.peer, reason: "unsupported" });
      return;
    }
    const action = routeSignal(this.state, msg, { sessionId: this.opts.sessionId, peer: this.peer });
    switch (action.type) {
      case "ignore":
        return;
      case "offer":
        return this.startOffer(action.to);
      case "answer":
        return this.acceptOffer(action.offer);
      case "apply_answer":
        return this.applyAnswer(action.sdp);
      case "add_ice":
        return this.addIce(action.candidate);
      case "close":
        // The other side gave up on the connection: count it here too, so the agent falls back in time.
        this.apply(action.failed ? { type: "failed", reason: "remote_failed", now: Date.now() } : { type: "remote_bye", now: Date.now() });
        return;
      case "unsupported":
        this.apply({ type: "unsupported", now: Date.now() });
        return;
    }
  }

  private createPc(callId: string): RTCPeerConnection {
    this.closePc();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers ?? [] });
    this.pc = pc;
    this.pendingIce = [];
    this.remoteStream = new MediaStream();
    pc.onicecandidate = (e) => {
      if (this.pc !== pc) return;
      this.send({ kind: "ice", peer: this.peer, callId, candidate: e.candidate ? (e.candidate.toJSON() as IceCandidateInit) : null });
    };
    pc.ontrack = (e) => {
      if (this.pc !== pc || !this.remoteStream) return;
      if (!this.remoteStream.getTracks().includes(e.track)) this.remoteStream.addTrack(e.track);
      // A new object so React consumers see the change.
      this.remoteStream = new MediaStream(this.remoteStream.getTracks());
      this.emit();
    };
    const onState = () => {
      if (this.pc !== pc) return;
      const st = pc.connectionState ?? pc.iceConnectionState;
      const ice = pc.iceConnectionState;
      if (st === "connected" || ice === "connected" || ice === "completed") this.apply({ type: "connected", now: Date.now() });
      else if (st === "failed" || ice === "failed") this.fail("ice_failed");
      else if (st === "disconnected" || ice === "disconnected") this.apply({ type: "disconnected", now: Date.now() });
    };
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = onState;
    return pc;
  }

  private closePc() {
    const pc = this.pc;
    this.pc = null;
    this.pendingIce = [];
    if (pc) {
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* already closed */
      }
    }
    if (this.remoteStream) {
      this.remoteStream = null;
      this.emit();
    }
  }

  private fail(reason: string) {
    this.hangUp(reason);
    this.apply({ type: "failed", reason, now: Date.now() });
  }

  /** Customer: offer camera video (send only, when the camera is on) and two-way audio to the agent peer that announced itself. */
  private async startOffer(to: string) {
    const stream = this.local;
    const video = stream?.getVideoTracks()[0];
    if (!stream || stream.getTracks().length === 0 || !this.iceServers) return; // Not ready yet; the agent announces again shortly.
    const callId = randomId();
    try {
      const pc = this.createPc(callId);
      this.apply({ type: "started", callId, remotePeer: to, now: Date.now() });
      if (video) pc.addTransceiver(video, { direction: "sendonly", streams: [stream] });
      const audio = stream.getAudioTracks()[0];
      if (audio) pc.addTransceiver(audio, { direction: "sendrecv", streams: [stream] });
      else pc.addTransceiver("audio", { direction: "recvonly" });
      await pc.setLocalDescription(await pc.createOffer());
      if (this.pc !== pc || !pc.localDescription) return;
      this.send({ kind: "offer", peer: this.peer, callId, to, sdp: pc.localDescription.sdp });
    } catch {
      if (this.state.callId === callId) this.fail("negotiation");
    }
  }

  /** Agent: answer, receiving video and audio and sending the microphone when there is one. */
  private async acceptOffer(offer: OfferSignal) {
    try {
      const pc = this.createPc(offer.callId);
      this.apply({ type: "started", callId: offer.callId, remotePeer: offer.peer, now: Date.now() });
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      const mic = this.local?.getAudioTracks()[0];
      for (const t of pc.getTransceivers()) {
        if (t.receiver.track.kind === "audio" && mic) {
          await t.sender.replaceTrack(mic);
          t.direction = "sendrecv";
        } else t.direction = "recvonly";
      }
      await pc.setLocalDescription(await pc.createAnswer());
      if (this.pc !== pc || !pc.localDescription) return;
      this.send({ kind: "answer", peer: this.peer, callId: offer.callId, sdp: pc.localDescription.sdp });
      await this.flushIce(pc);
    } catch {
      if (this.state.callId === offer.callId) this.fail("negotiation");
    }
  }

  private async applyAnswer(sdp: string) {
    const pc = this.pc;
    if (!pc) return;
    try {
      await pc.setRemoteDescription({ type: "answer", sdp });
      await this.flushIce(pc);
    } catch {
      this.fail("negotiation");
    }
  }

  private async addIce(candidate: IceCandidateInit | null) {
    const pc = this.pc;
    if (!pc) return;
    if (!pc.remoteDescription) {
      if (candidate) this.pendingIce.push(candidate);
      return;
    }
    await pc.addIceCandidate(candidate ?? undefined).catch(() => {});
  }

  private async flushIce(pc: RTCPeerConnection) {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const c of queued) if (this.pc === pc) await pc.addIceCandidate(c).catch(() => {});
  }
}

export interface LiveCall {
  state: CallState;
  /** Connecting / Reconnecting / Live / Fallback: snapshots, or null when no call applies. */
  label: string | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  micAvailable: boolean;
  toggleMic: () => void;
  retry: () => void;
}

/**
 * React binding. `eligible` comes from the session (see callEligibility);
 * `localStream` is the customer's camera stream (ignored for the agent, whose
 * microphone is acquired once a call applies).
 */
export function useLiveCall({
  role,
  sessionId,
  keyId,
  transport,
  eligible,
  localStream = null,
}: {
  role: CallRole;
  sessionId: string;
  keyId: string;
  transport: Transport | null;
  eligible: boolean;
  localStream?: MediaStream | null;
}): LiveCall {
  const controller = useMemo(() => (transport ? new LiveCallController({ role, sessionId, key: keyId, transport }) : null), [role, sessionId, keyId, transport]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribe(rerender);
    const onHide = () => controller.hangUp("left");
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => controller?.setLocalStream(localStream), [controller, localStream]);
  useEffect(() => controller?.setEligible(eligible), [controller, eligible]);

  if (!controller) return { state: initialCall(role), label: null, remoteStream: null, micOn: true, micAvailable: false, toggleMic: noop, retry: noop };
  return {
    state: controller.state,
    label: callStatusLabel(controller.state),
    remoteStream: controller.remoteStream,
    micOn: controller.micOn,
    micAvailable: controller.micAvailable,
    toggleMic: () => controller.toggleMic(),
    retry: () => controller.retry(),
  };
}

const noop = () => {};

