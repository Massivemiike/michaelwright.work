import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { contactSchema } from "@/lib/validations/contact.schema";

const TO_EMAIL = process.env.TO_EMAIL ?? "michael.wright@gpltech.com";

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const body = await req.json();
    const result = contactSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid form data", issues: result.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, subject, message, honeypot } = result.data;

    // Honeypot — silently succeed for bots
    if (honeypot) {
      return NextResponse.json({ success: true });
    }

    await resend.emails.send({
      from: "Contact Form <onboarding@resend.dev>",
      to: TO_EMAIL,
      replyTo: email,
      subject: `[michaelwright.work] ${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#08080C;color:#F0F2F8;padding:2rem;border-radius:8px;">
          <div style="border-left:4px solid #FF3B2F;padding-left:1rem;margin-bottom:1.5rem;">
            <h2 style="margin:0;color:#FF3B2F;font-size:1.25rem;">New message from michaelwright.work</h2>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem;">
            <tr><td style="padding:0.5rem 0;color:#787F96;width:80px;">From</td><td style="color:#F0F2F8;">${name}</td></tr>
            <tr><td style="padding:0.5rem 0;color:#787F96;">Email</td><td><a href="mailto:${email}" style="color:#7FDBFF;">${email}</a></td></tr>
            <tr><td style="padding:0.5rem 0;color:#787F96;">Subject</td><td style="color:#F0F2F8;">${subject}</td></tr>
          </table>
          <div style="background:#0F0F15;border:1px solid #1F1F2E;border-radius:6px;padding:1.25rem;">
            <p style="margin:0;color:#787F96;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
