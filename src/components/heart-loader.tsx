import { Heart } from "lucide-react";
export function HeartLoader({ size = 30 }: { size?: number }) {
  return (
    <Heart size={size} className="summary-heart-loader" aria-hidden="true" />
  );
}
