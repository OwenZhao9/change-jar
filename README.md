# 需求变更罐 Change Jar

产品经理每提交一张需求变更单，就从预存的保证金里扣一份变更费，投进"变更罐"。上线那天，罐里的钱平分给开发，没用完的保证金退回产品经理。

部署在 Monad 测试网（chainId 10143）。

合约地址：`0x7a07aD401432441a8A304D54F814AD0C0c9aD8A4`

## 规则

1. 产品经理创建项目：登记 1 到 10 个开发地址，设定每张变更单的费用，存入保证金（推荐 8 倍变更费），并提交第 0 版需求的哈希。
2. 开发确认收到某一版需求。
3. 产品经理提交变更单：保证金够时从保证金扣费进罐；保证金用完后，每张变更单随交易现付一份变更费。每张变更单记录版本、需求哈希、说明、费用和时间。
4. 上线：产品经理或任意开发都可以触发。罐里的钱平分给开发，剩余保证金和除不尽的零头记给产品经理。
5. 各人自己调用 `withdraw()` 领取。
6. 一次变更都没有时，产品经理可以取消项目，保证金全额退回。

## 合约

`contracts/src/ChangeJar.sol`，Foundry 项目，30 个测试。

```bash
cd contracts
forge install foundry-rs/forge-std --no-git
forge test
```

部署（私钥只放在环境变量里）：

```bash
export PRIVATE_KEY=<专用测试钱包私钥>
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
```

主要接口：

| 函数 | 谁可以调用 | 说明 |
|---|---|---|
| `createProject(devs, fee, specHash)` payable | 任何人 | 创建项目，附带保证金 |
| `acknowledge(id, version)` | 开发 | 确认收到某一版 |
| `submitChange(id, newSpecHash, note)` payable | 产品经理 | 提交变更单 |
| `launch(id)` | 产品经理或开发 | 上线并记账 |
| `cancel(id)` | 产品经理 | 零变更时取消 |
| `withdraw()` | 任何人 | 领取自己的余额 |
| `getProject(id)` / `getChanges(id)` | 只读 | 重建状态和版本时间线 |

## 前端

`web/`，Next.js 静态导出，部署在 Cloudflare Pages。三个浏览器内钱包（产品经理、开发 1、开发 2），提交变更时使用 Monad 的同步回执。

```bash
cd web
pnpm install
NEXT_PUBLIC_CHANGE_JAR_ADDRESS=<合约地址> pnpm build
```

## 文档

`docs/requirements.md`：需求文档。

## 许可证

MIT
