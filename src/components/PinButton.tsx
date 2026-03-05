import { Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePinnedPlayers } from "@/lib/pinned-players";

export function PinButton({
  username,
  size = "sm",
}: {
  username: string;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const { isPinned, pin, unpin, pinned, maxPinned } = usePinnedPlayers();
  const pinned_ = isPinned(username);
  const full = pinned.length >= maxPinned && !pinned_;

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const padding = size === "sm" ? "p-1" : "p-1.5";

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pinned_) unpin(username);
        else if (!full) pin(username);
      }}
      disabled={full}
      title={
        pinned_
          ? t("pin.unpin", { username })
          : full
            ? t("pin.maxReached", { max: maxPinned })
            : t("pin.pin", { username })
      }
      className={`${padding} rounded transition-colors ${
        pinned_
          ? "text-amber-500 hover:text-amber-400"
          : full
            ? "text-muted-foreground/30 cursor-not-allowed"
            : "text-muted-foreground/50 hover:text-amber-500"
      }`}
    >
      {pinned_ ? (
        <PinOff className={iconSize} />
      ) : (
        <Pin className={iconSize} />
      )}
    </button>
  );
}
