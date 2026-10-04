import { ServiceUnavailable } from "@/components/service-unavailable";
// Fail closed: no token is considered valid before invitation verification exists.
// Never render the token, patient identity, or medical data in this route.
export default function InvitationPage() {
  return <ServiceUnavailable />;
}
