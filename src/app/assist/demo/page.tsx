"use client";
import { useEffect, useState } from "react";
import { CustomerExperience } from "@/components/assist/CustomerExperience";
import { SimulationPanel } from "@/components/assist/SimulationPanel";
import { ASSIST_STATES } from "@/components/assist/states";

export default function AssistDemoPage() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!auto) return;
    if (index >= ASSIST_STATES.length - 1) { setAuto(false); return; }
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, ASSIST_STATES.length - 1)), ASSIST_STATES[index].dwell * 1000);
    return () => clearTimeout(t);
  }, [auto, index]);

  return (
    <main className="min-h-screen bg-canvas md:flex md:items-center md:justify-center md:gap-10 md:px-6 md:py-8">
      <div className="shrink-0 md:rounded-[40px] md:bg-ink md:p-2.5 md:shadow-pop">
        <div className="h-[100dvh] w-full md:h-[800px] md:w-[390px] md:overflow-hidden md:rounded-[30px]">
          <CustomerExperience index={index} onIndexChange={setIndex} className="h-full" />
        </div>
      </div>
      <div className="p-4 md:p-0">
        <p className="label mb-3">Customer experience, simulated</p>
        <SimulationPanel index={index} onIndexChange={setIndex} auto={auto} onAutoChange={setAuto} />
      </div>
    </main>
  );
}
