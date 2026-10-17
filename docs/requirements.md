# 让需求飞 需求文档

## 1. 一句话

产品经理每提交一次需求变更单，就从预存的保证金里自动往"变更罐"里投一枚币；上线那天，罐里的钱平分给开发，没花完的保证金退回产品经理。

## 2. 要解决的事

- 需求被反复口头改动，开发白白承担返工，却没有任何记录和补偿。
- 办法：改动必须走变更单，每张变更单自带费用，费用进罐、归开发。没有变更单的口头改动，在系统里就不算需求。

## 3. 角色

| 角色 | 是谁 | 能做什么 |
|---|---|---|
| 产品经理（PM） | 创建项目的人 | 创建项目并存保证金；提交变更单；上线；领取退款；零变更时取消 |
| 开发（Dev） | 项目里登记的 1 到 10 个地址 | 确认收到某一版需求；上线；领取分成 |
| 机器人 PM | 演示用 | 一键连续提交 6 张变更单，逐笔等回执再发下一笔 |

演示时一个人开三个浏览器内钱包：1 个 PM、2 个 Dev。钱包用底座仓库的钱包模块，水龙头自动领测试币。

## 4. 规则（合约状态机）

状态：`Active`（进行中）→ `Launched`（已上线）或 `Cancelled`（已取消）。

1. **创建项目** `createProject(devs, fee, specHash)`，随交易附带保证金
   - `devs`：1 到 10 个地址，不得有零地址、重复地址，不得包含 PM 自己。
   - `fee`：每张变更单的费用，大于 0。
   - 保证金（`msg.value`）不小于 `fee`，推荐 `8 × fee`。
   - `specHash`：第 0 版需求文本的哈希。
2. **确认收到** `acknowledge(id, version)`
   - 只有 Dev 可调用，只在 `Active` 状态，`version` 不得大于当前版本。只写记录，不影响钱。
3. **提交变更单** `submitChange(id, newSpecHash, note)`
   - 只有 PM 可调用，只在 `Active` 状态；`note` 不得超过 140 字节。
   - 剩余保证金不少于 `fee`：`msg.value` 必须为 0，从保证金扣 `fee` 进罐。
   - 剩余保证金不足 `fee`：`msg.value` 必须恰好等于 `fee`，直接进罐；原有剩余保证金不动，上线时退回 PM。
   - 版本号加 1，把这次变更（版本、规格哈希、说明、费用、时间、是否现付）存进合约的数组。
4. **上线** `launch(id)`
   - PM 或任意 Dev 都可调用，只在 `Active` 状态。无论谁调用，分钱结果相同。
   - 只记账，不转账：罐子平分，每个 Dev 的可领余额增加 `jar / n`；PM 的可领余额增加 剩余保证金 + `jar % n`（除不尽的零头）。
   - 状态变为 `Launched`。
5. **领取** `withdraw()`
   - 任何人领取自己的可领余额，余额清零后转账，重入保护。
6. **取消** `cancel(id)`
   - 只有 PM，只在版本号为 0（零变更）时；保证金记入 PM 的可领余额，状态 `Cancelled`。

边界情况：
- 一次都没改就上线：罐为 0，保证金全额记给 PM。
- 单个 Dev：整罐归他。
- 上线或取消之后：`submitChange`、`launch`、`cancel`、`acknowledge` 全部回滚，只有 `withdraw` 可用。
- 某个 Dev 地址拒收转账：不影响其他人，因为每个人自己领取。

## 5. 合约接口（单文件）

```solidity
struct Change {
    bytes32 specHash;
    string note;
    uint256 fee;
    uint64 timestamp;
    bool paidFromDeposit;   // true 表示从保证金扣，false 表示现付
}

struct Project {
    address pm;
    address[] devs;
    uint256 fee;
    uint256 deposit;     // 剩余保证金
    uint256 jar;         // 变更罐余额
    uint32 version;      // 当前版本，从 0 开始
    uint8 status;        // 0 Active, 1 Launched, 2 Cancelled
}

mapping(address => uint256) public claimable;

event ProjectCreated(uint256 indexed id, address indexed pm, uint256 fee, uint256 deposit, bytes32 specHash);
event Acknowledged(uint256 indexed id, address indexed dev, uint32 version);
event ChangeSubmitted(uint256 indexed id, uint32 version, bytes32 specHash, string note, uint256 fee, bool paidFromDeposit, uint256 jarTotal, uint64 timestamp);
event Launched(uint256 indexed id, uint256 jarTotal, uint256 perDev, uint256 refundToPm);
event Cancelled(uint256 indexed id, uint256 refund);
event Withdrawn(address indexed who, uint256 amount);

function createProject(address[] calldata devs, uint256 fee, bytes32 specHash) external payable returns (uint256 id);
function acknowledge(uint256 id, uint32 version) external;
function submitChange(uint256 id, bytes32 newSpecHash, string calldata note) external payable;
function launch(uint256 id) external;
function cancel(uint256 id) external;
function withdraw() external;
function getProject(uint256 id) external view returns (Project memory);
function getChanges(uint256 id) external view returns (Change[] memory);
```

前端用 `getProject` 和 `getChanges` 一次读取重建版本时间线，不依赖日志；事件只作为区块浏览器里的证据。公共节点 `getLogs` 实测约 100 个区块一次（来源：GitHub 上 Paras #122，2026-10-13；arteri #17，2026-10-05），所以不用日志做主流程。

## 6. 页面（单页）

三栏布局，顶部是角色切换（PM / Dev1 / Dev2）：

- **左：需求时间线**。v0、v1 ... 一版一张卡，显示变更说明、时间、费用、"已保证金扣 / 现付"标记；Dev 点卡片上的"已收到"。
- **中：变更罐**。一只像素玻璃罐，每提交一张变更单落下一枚金币；罐内显示"已投 N 枚 / 共 X MON"，旁边是剩余保证金条。
- **右：开发者**。两个头像，各自显示"将分得 Y MON"（上线前是预估，不是已付）。
- **底部**：PM 视角有"提交变更"和"机器人连改 6 次"按钮；PM 或 Dev 视角有"上线"按钮；一条区块确认状态栏。

### 翻转（演示核心画面）

- 第 8 次变更落下，保证金恰好用完，金币雨洒在罐子周围，罐口盖上"保证金已用完，之后每次现付"章。
- 点"上线"，罐里的钱分成两股飞向两个开发头像，各自点"领取"后余额跳动。

### 界面风格

复古像素街机风：深色背景，像素玻璃罐，金币逐枚落下带脆响；字体用像素体；整屏只有一个主角（罐子）。参考冠亚军里"投币面板"和"暗色极简加图标"的做法：一屏看懂，不放多余模块。

## 7. 3 分钟演示脚本

现场创建项目，参数预填，一键创建。区块浏览器标签页提前打开。

| 时间 | 画面 | 说话 |
|---|---|---|
| 0:00–0:20 | 开屏：空罐子，三个角色头像 | "产品经理改一次需求，开发白干一次。这里改一次，就要往罐里投一枚币。" |
| 0:20–0:50 | 一键创建项目：2 个开发、每张变更单 0.1 MON、保证金 0.8 MON；Dev 点"已收到" | "保证金先锁住，需求第 0 版开发已确认。" |
| 0:50–1:20 | PM 手动提交变更 v1、v2，罐里落下 2 枚金币，时间线多出 2 张卡 | "没提交变更单的口头改动，不算需求；提交了，就要付费。" |
| 1:20–2:10 | 点"机器人连改 6 次"：金币一枚枚落下，到第 8 次（共 v8）保证金用完，罐口盖章，金币雨洒在罐子周围 | "第 8 次改需求，保证金用完了，再改就要现付。" |
| 2:10–2:40 | 点"上线"，罐里的钱平分飞向两个开发，各点"领取"；区块浏览器切到 `Launched` 事件（只切换，不加载） | "上线那天，罐里的钱平分，记录在链上改不了。" |
| 2:40–3:00 | 回到时间线，v0 到 v8 一目了然 | "每一次改动都有时间和费用，谁改了几次，一清二楚。" |

要演示现付时，再单独手动提交第 9 张变更单，PM 钱包里要留够这笔钱。变更说明文字预置在剪贴板里，不现场打字。

## 8. 用到的 Monad 能力

- 同步回执：提交变更单优先使用 `sendTransactionSync`（底座仓库的 `sendTxSync`），一确认就返回，金币落下与回执同步。
- **开工第一件事**：用 `https://testnet-rpc.monad.xyz` 实测发一笔同步交易。官方 changelog（testnet v0.14.5，2026-06-04）写明该方法只在开启执行事件的节点上支持，公共节点支持 WebSocket，大概率可用，但需实测。代码里必须写好退路：同步调用失败时，改用普通发送加等待回执。
- 机器人连发：逐笔等回执再发下一笔（或本地管理 nonce），避免交易互相冲掉。
- 其余能力不使用，不在介绍里写没用到的特性。

## 9. 技术与部署

- 链：Monad 测试网，chainId 10143，RPC `https://testnet-rpc.monad.xyz`，水龙头 `https://faucet.monad.xyz`。公共节点限速 50 次每秒，`eth_call` 和 `eth_estimateGas` 25 次每秒。
- 合约：Foundry（≥1.8.0，Monad 模式），Solidity，1 个合约文件。
- 前端：Next.js 加 viem，沿用底座仓库的 web 外壳、钱包、区块时钟、Flip 组件。开工前先确认底座里 `sendTxSync`、`BlockClockBar`、`recordTxLatency`、`createOrLoadBurnerWallet` 是否存在，不存在就自己写。
- 部署：前端放 Vercel 或 Cloudflare Pages，合约部署到测试网并在区块浏览器验证；仓库公开，不含私钥（部署密钥只通过环境变量 `PRIVATE_KEY` 由使用者自己设置）。

## 10. 测试清单（Foundry）

1. 创建项目：保证金小于 `fee`、开发数为 0 或超过 10、零地址、重复地址、PM 在开发里，全部回滚。
2. `submitChange`：非 PM 回滚；保证金足够时附带 `msg.value` 回滚；扣保证金、罐子增加、版本加 1；保证金不足时 `msg.value` 不等于 `fee` 回滚；现付进罐，原剩余保证金不动；`note` 超长回滚。
3. `launch`：PM 或 Dev 均可调用且结果相同；陌生人回滚；平分正确；零头与剩余保证金记给 PM；零变更时保证金全记给 PM；单 Dev 整罐归他；重复上线回滚。
4. `withdraw`：各自只能领自己的；余额清零；拒收转账的 Dev 不影响其他人领取。
5. `cancel`：版本大于 0 时回滚；零变更时保证金记给 PM。
6. `acknowledge`：非 Dev 回滚；版本超过当前版本回滚；非 `Active` 回滚。
7. 上线或取消后：`submitChange`、`launch`、`cancel`、`acknowledge` 回滚。
8. 重入攻击：恶意合约在 `withdraw` 回调里再次调用 `withdraw`，必须失败。

## 11. 验收清单

- [ ] 公开链接可打开，三个浏览器内钱包能自动领测试币。
- [ ] 提交变更单后罐子落币，时间线新增一版，区块浏览器能看到 `ChangeSubmitted` 事件。
- [ ] 第 8 次变更出现"保证金已用完"画面，第 9 次需要现付。
- [ ] 点"上线"后各开发领取分成，PM 领取剩余保证金。
- [ ] 重新打开页面，时间线和罐子状态能从链上一次读取完整重建。
- [ ] 同步回执实测通过，或退路（普通发送加等待回执）可用。
- [ ] 仓库有 README（项目一句话、演示链接、合约地址、用到的 Monad 能力）。

## 12. 评委可能的追问

- **"谁来判定一次变更？"** 流程判定：只有 PM 提交的变更单才计费，不需要任何人证明"他改了需求"。
- **"口头改动怎么办？"** 链上只能记录提交过的变更单，口头改动链上看不到。"开发只做已提交变更单的需求"是团队约定，不是合约强制。
- **"PM 把十个改动塞进一张变更单怎么办？"** 费用按张计，颗粒度由团队约定；开发可以不点"已收到"，表示不接受这一版。合约不做强制。
- **"PM 用小号当开发，钱不就回到自己手里？"** 合约挡不住小号。项目的前提是公司或团队里开发身份由团队认定。
- **"PM 凭什么愿意存保证金？"** 公司或项目规定的变更保证金，是场景设定，不是链上能强制的。
- **"为什么要上链？"** 钱由合约托管：PM 在上线前取不回已扣的变更费，开发不需要相信 PM 会付钱。

## 13. 不做的事（本次范围外）

- 开发加入确认（`join`）、截止日期和超时机制。
- PM 与开发之间的争议仲裁。
- 多项目列表、账号体系、通知。
- 把工单系统、聊天软件接进来。
