import { cn } from "@/lib/utils";
import { ADMIN_WHATSAPP, adminWhatsAppUrl } from "@/lib/site";

/** The admin's WhatsApp number as a link that opens a chat — the one place
 * users are told to get an access code. No hooks, so it works in server and
 * client components alike. */
export function AdminWhatsAppLink({ email, className }: { email?: string | null; className?: string }) {
  return (
    <a
      href={adminWhatsAppUrl(email)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-medium text-foreground underline-offset-4 hover:underline", className)}
    >
      {ADMIN_WHATSAPP.display}
    </a>
  );
}
