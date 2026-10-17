import type { Metadata, Viewport } from 'next';
import '@fontsource/press-start-2p/400.css';
import './globals.css';
import { CoinDefs } from '@/components/Coin';

export const metadata: Metadata = {
  title: '让需求飞',
  description: '产品经理每提交一张需求变更单，就从保证金里扣一份变更费进罐；上线时罐里的钱平分给开发。',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0d0b1a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body><CoinDefs />{children}</body>
    </html>
  );
}
