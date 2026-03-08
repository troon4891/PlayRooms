import type { ReactNode } from "react";

interface RoomLayoutProps {
  children: ReactNode;
}

export default function RoomLayout({ children }: RoomLayoutProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {children}
    </div>
  );
}
