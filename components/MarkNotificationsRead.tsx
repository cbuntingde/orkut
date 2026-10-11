"use client";
import { useRouter } from "next/navigation";
import { markAllRead } from "@/lib/notify-actions";

export default function MarkNotificationsRead({ count }: { count?: number } = {}) {
  const router = useRouter();
  if (count === 0) return <span className="text-[11px] text-gray-400">all read</span>;
  return (
    <button
      onClick={async () => {
        await markAllRead();
        router.refresh();
      }}
      className="text-[11px] text-gray-500 underline"
    >
      mark all as read
    </button>
  );
}