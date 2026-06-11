import { MessageSquareDashed } from "lucide-react";

export function meta() {
  return [{ title: "matrix-client" }];
}

/** 방 미선택 빈 화면 — 방 목록/초대는 사이드바가 담당 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-fg-3">
      <MessageSquareDashed className="h-8 w-8" strokeWidth={1.25} />
      <p className="text-[13px]">왼쪽 트리에서 방을 선택해</p>
    </div>
  );
}
