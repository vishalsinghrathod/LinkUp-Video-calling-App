import type { Metadata } from "next";

import "./globals.css";





export const metadata: Metadata = {
  title: "LinkUp  | Anonymous Video Chat",
  description: "Random video or voice Chat with Random people",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en">

      <body className="min-h-full flex flex-col">{children}</body>
      
    </html>
  );
}
