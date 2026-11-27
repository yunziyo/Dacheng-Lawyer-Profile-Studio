import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大成深圳律师宣传材料工作台",
  description: "制作律师电子名片和个人网站，导入简历后逐项核对并下载成品。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function Home() {
  return <iframe title="大成深圳律师宣传材料工作台" src="/workbench" className="workbench-frame" />;
}
