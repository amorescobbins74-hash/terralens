import './globals.css';
export const metadata = {
  title: 'TerraLens · 地表变化证据工作台',
  description:
    '公开 Sentinel-2 影像的浏览器端 STAC / COG 分析与可复现证据导出。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
