import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transcritor de Vídeo",
  description: "Transcrição local de vídeos em blocos de até 10 minutos",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
