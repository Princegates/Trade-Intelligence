import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Chat with admin" — opens a WhatsApp chat with the admin, the one place
 * users are told to get an access code. It goes through /contact/whatsapp,
 * which adds the signed-in user's email to the message and keeps the
 * admin's number off the page. No hooks, so it works in server and client
 * components alike. */
export function AdminWhatsAppLink({ className }: { className?: string }) {
  return (
    <a
      href="/contact/whatsapp"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap font-medium text-foreground underline-offset-4 hover:underline",
        className
      )}
    >
      <MessageCircle className="size-3.5" aria-hidden />
      Chat with admin
    </a>
  );
}
