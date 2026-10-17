# 需求变更罐 · 前端

产品经理每提交一张需求变更单，就从预存保证金里扣一份变更费进罐；上线时罐里的钱平分给开发，剩余保证金退回产品经理。

单页三栏：左边是需求时间线（v0、v1…每版一张卡），中间是变更罐（每张变更单落下一枚金币），右边是两位开发（将分得多少、领取）。顶部切换产品经理 / 开发 1 / 开发 2 三个浏览器内钱包。

## 运行

```bash
pnpm install
pnpm dev
pnpm build                   # 静态导出到 out/，可直接部署到 Cloudflare Pages
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_CHANGE_JAR_ADDRESS` | ChangeJar 合约地址，默认 `0x7a07aD401432441a8A304D54F814AD0C0c9aD8A4`（Monad 测试网，chainId 10143） |
| `NEXT_PUBLIC_RPC_URL` | 可选，默认 `https://testnet-rpc.monad.xyz` |
| `NEXT_PUBLIC_EXPLORER_URL` | 可选，默认 `https://testnet.monadvision.com` |
| `NEXT_PUBLIC_LOCAL_DEV` | 仅 `pnpm dev`：设为 `1` 时使用内存合约开发界面 |

## 用到的 Monad 能力

- 同步回执：交易通过 `eth_sendRawTransactionSync`（viem `sendTransactionSync`）发送，确认即返回，金币落下与回执同步；节点不支持时改为普通发送并等待回执。底部状态栏显示每笔交易的确认耗时。
- 读取：`getProject` + `getChanges` 一次读取重建时间线和罐子状态。

## 钱包

三个钱包的私钥在浏览器内生成并保存在 localStorage，余额不足时自动向 Monad 水龙头接口领取测试币。
