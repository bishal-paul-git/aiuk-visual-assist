# Security, Privacy and Compliance

# 1. Security Objectives

The platform must protect:
- live media
- transcripts
- selected images
- customer identifiers
- account data
- business workflow data
- credentials
- audit records

---

# 2. Required Controls

Production should support:
- TLS in transit
- encryption at rest
- SSO
- MFA
- RBAC
- least privilege
- tenant isolation
- secrets management
- key rotation
- security logging
- audit logs
- retention controls
- deletion workflows
- redaction where required
- incident response
- vulnerability management
- dependency management

---

# 3. Privacy Principles

- collect only what is needed
- process for defined purpose
- do not retain full video by default
- selected evidence should be minimal
- distinguish live-only from retained-evidence mode
- expose clear privacy information
- support tenant-specific retention
- support deletion/redaction policy

---

# 4. Sensitive Visual Data

Policies should explicitly address:
- bystanders
- children
- identity documents
- payment cards
- medical information
- confidential documents
- private home interiors
- computer screens
- vehicle plates
- special-category information

---

# 5. DPIA

A use-case-specific DPIA should be completed before production processing of customer video in higher-risk deployments.

---

# 6. Data Residency

For each deployment, document:
- media region
- speech region
- multimodal model region
- workflow region
- database region
- storage region
- subprocessors
- international transfers

---

# 7. Audit Requirements

Record where proportionate:
- model version
- prompt/policy version
- workflow version
- material observations
- confidence
- business actions
- human interventions
- escalation reason
