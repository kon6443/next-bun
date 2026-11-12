import { FortressSocketProvider } from "../../../battle-ui/contexts/FortressSocketContext";

// 로비·방이 소켓 하나를 같이 쓴다 — layout은 로비 → 방 이동에도 유지되어 연결이 끊기지 않는다
export default function FortressBattleLayout({ children }: { children: React.ReactNode }) {
  return <FortressSocketProvider>{children}</FortressSocketProvider>;
}
