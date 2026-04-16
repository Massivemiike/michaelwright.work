"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "motion/react";
import { Send, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { contactSchema, type ContactFormData } from "@/lib/validations/contact.schema";

type FormState = "idle" | "submitting" | "success" | "error";

export default function ContactForm() {
  const [formState, setFormState] = useState<FormState>("idle");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  async function onSubmit(data: ContactFormData) {
    setFormState("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setFormState("success");
      reset();
    } catch {
      setFormState("error");
    }
  }

  return (
    <AnimatePresence mode="wait">
      {formState === "success" ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "3rem 2rem",
            background: "rgba(15,15,21,0.9)",
            border: "1px solid rgba(127,219,255,0.2)",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <CheckCircle size={40} style={{ color: "#7FDBFF", margin: "0 auto 1rem" }} />
          <h3 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "#F0F2F8", marginBottom: "0.75rem" }}>
            Message sent
          </h3>
          <p style={{ color: "#787F96", marginBottom: "1.5rem" }}>
            Thanks for reaching out. I'll get back to you within 24 hours.
          </p>
          <button
            onClick={() => setFormState("idle")}
            style={{ fontSize: "0.875rem", color: "#FF3B2F", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Send another message
          </button>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          noValidate
        >
          {/* Honeypot — hidden from humans */}
          <input
            {...register("honeypot")}
            type="text"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <Field label="Name" error={errors.name?.message}>
              <input {...register("name")} placeholder="Your name" />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input {...register("email")} type="email" placeholder="your@email.com" />
            </Field>
          </div>

          <Field label="Subject" error={errors.subject?.message}>
            <input {...register("subject")} placeholder="What's this about?" />
          </Field>

          <Field label="Message" error={errors.message?.message}>
            <textarea {...register("message")} placeholder="Tell me what you're working on..." rows={6} />
          </Field>

          {formState === "error" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", background: "rgba(255,59,47,0.08)", border: "1px solid rgba(255,59,47,0.25)", borderRadius: 6 }}>
              <AlertCircle size={16} style={{ color: "#FF3B2F", flexShrink: 0 }} />
              <span style={{ fontSize: "0.875rem", color: "#FF3B2F" }}>Something went wrong. Please try again or email me directly.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={formState === "submitting"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.875rem 2rem",
              background: formState === "submitting" ? "rgba(255,59,47,0.5)" : "#FF3B2F",
              color: "#F0F2F8",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: "0.9375rem",
              cursor: formState === "submitting" ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
              transition: "background 0.2s",
            }}
          >
            {formState === "submitting" ? (
              <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Sending...</>
            ) : (
              <><Send size={16} /> Send Message</>
            )}
          </button>

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            form input, form textarea {
              width: 100%;
              background: rgba(15,15,21,0.9);
              border: 1px solid #27273A;
              border-radius: 6px;
              padding: 0.75rem 1rem;
              color: #F0F2F8;
              font-size: 0.9375rem;
              font-family: var(--font-body-var,'Outfit'),sans-serif;
              outline: none;
              transition: border-color 0.2s;
              resize: vertical;
            }
            form input:focus, form textarea:focus { border-color: #FF3B2F; }
            form input::placeholder, form textarea::placeholder { color: #3C3F52; }
          `}</style>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#787F96" }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: "0.75rem", color: "#FF3B2F" }}>{error}</span>}
    </div>
  );
}
