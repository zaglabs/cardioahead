export function sealInvitation(
  value: { token: string; code: string },
  secret: string,
  binding: string,
): string;
export function openInvitation(
  value: string,
  secret: string,
  binding: string,
): { token: string; code: string };
