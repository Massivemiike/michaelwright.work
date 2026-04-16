import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Please enter a valid email address"),
  subject: z.string().min(3, "Subject must be at least 3 characters").max(120),
  message: z.string().min(20, "Message must be at least 20 characters").max(4000),
  honeypot: z.string().max(0, "Bot detected"),
});

export type ContactFormData = z.infer<typeof contactSchema>;
