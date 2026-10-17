// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChangeJar
/// @notice 产品经理每提交一次需求变更单，就从保证金里扣一份变更费进"变更罐"；
///         上线时罐里的钱平分给开发，剩余保证金退回产品经理。所有转账由各人自行领取。
contract ChangeJar {
    uint8 public constant ACTIVE = 0;
    uint8 public constant LAUNCHED = 1;
    uint8 public constant CANCELLED = 2;
    uint256 public constant MAX_DEVS = 10;
    uint256 public constant MAX_NOTE_BYTES = 140;

    struct Change {
        bytes32 specHash;
        string note;
        uint256 fee;
        uint64 timestamp;
        bool paidFromDeposit; // true: 从保证金扣；false: 现付
    }

    struct Project {
        address pm;
        address[] devs;
        uint256 fee;
        uint256 deposit; // 剩余保证金
        uint256 jar; // 变更罐余额
        uint32 version; // 当前版本，从 0 开始
        uint8 status;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) private projects;
    mapping(uint256 => Change[]) private changes; // changes[id][v] 对应第 v 版，v0 是初始需求
    mapping(uint256 => mapping(address => mapping(uint32 => bool))) public acknowledged;
    mapping(address => uint256) public claimable;

    bool private locked;

    event ProjectCreated(uint256 indexed id, address indexed pm, uint256 fee, uint256 deposit, bytes32 specHash);
    event Acknowledged(uint256 indexed id, address indexed dev, uint32 version);
    event ChangeSubmitted(
        uint256 indexed id,
        uint32 version,
        bytes32 specHash,
        string note,
        uint256 fee,
        bool paidFromDeposit,
        uint256 jarTotal,
        uint64 timestamp
    );
    event Launched(uint256 indexed id, uint256 jarTotal, uint256 perDev, uint256 refundToPm);
    event Cancelled(uint256 indexed id, uint256 refund);
    event Withdrawn(address indexed who, uint256 amount);

    modifier nonReentrant() {
        require(!locked, "reentrant");
        locked = true;
        _;
        locked = false;
    }

    function createProject(address[] calldata devs, uint256 fee, bytes32 specHash)
        external
        payable
        returns (uint256 id)
    {
        require(devs.length >= 1 && devs.length <= MAX_DEVS, "devs count");
        require(fee > 0, "fee zero");
        require(msg.value >= fee, "deposit < fee");
        for (uint256 i = 0; i < devs.length; i++) {
            require(devs[i] != address(0), "zero dev");
            require(devs[i] != msg.sender, "pm is dev");
            for (uint256 j = 0; j < i; j++) {
                require(devs[i] != devs[j], "duplicate dev");
            }
        }

        id = projectCount++;
        Project storage p = projects[id];
        p.pm = msg.sender;
        p.devs = devs;
        p.fee = fee;
        p.deposit = msg.value;
        p.status = ACTIVE;

        changes[id].push(
            Change({specHash: specHash, note: "", fee: 0, timestamp: uint64(block.timestamp), paidFromDeposit: false})
        );
        emit ProjectCreated(id, msg.sender, fee, msg.value, specHash);
    }

    function acknowledge(uint256 id, uint32 version) external {
        Project storage p = _active(id);
        require(_isDev(p, msg.sender), "not dev");
        require(version <= p.version, "future version");
        acknowledged[id][msg.sender][version] = true;
        emit Acknowledged(id, msg.sender, version);
    }

    function submitChange(uint256 id, bytes32 newSpecHash, string calldata note) external payable {
        Project storage p = _active(id);
        require(msg.sender == p.pm, "not pm");
        require(bytes(note).length <= MAX_NOTE_BYTES, "note too long");

        bool fromDeposit;
        if (p.deposit >= p.fee) {
            require(msg.value == 0, "no payment needed");
            p.deposit -= p.fee;
            fromDeposit = true;
        } else {
            require(msg.value == p.fee, "pay exact fee");
        }
        p.jar += p.fee;
        p.version += 1;

        changes[id].push(
            Change({
                specHash: newSpecHash,
                note: note,
                fee: p.fee,
                timestamp: uint64(block.timestamp),
                paidFromDeposit: fromDeposit
            })
        );
        emit ChangeSubmitted(id, p.version, newSpecHash, note, p.fee, fromDeposit, p.jar, uint64(block.timestamp));
    }

    /// @notice PM 或任意开发都可上线；无论谁调用，分账结果相同。只记账，不转账。
    function launch(uint256 id) external {
        Project storage p = _active(id);
        require(msg.sender == p.pm || _isDev(p, msg.sender), "not member");
        p.status = LAUNCHED;

        uint256 n = p.devs.length;
        uint256 perDev = p.jar / n;
        for (uint256 i = 0; i < n; i++) {
            claimable[p.devs[i]] += perDev;
        }
        uint256 refund = p.deposit + (p.jar % n);
        p.deposit = 0;
        claimable[p.pm] += refund;
        emit Launched(id, p.jar, perDev, refund);
    }

    /// @notice 零变更时 PM 可取消，保证金记入 PM 的可领余额。
    function cancel(uint256 id) external {
        Project storage p = _active(id);
        require(msg.sender == p.pm, "not pm");
        require(p.version == 0, "has changes");
        p.status = CANCELLED;
        uint256 refund = p.deposit;
        p.deposit = 0;
        claimable[p.pm] += refund;
        emit Cancelled(id, refund);
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "nothing to claim");
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function getProject(uint256 id) external view returns (Project memory) {
        require(id < projectCount, "no project");
        return projects[id];
    }

    function getChanges(uint256 id) external view returns (Change[] memory) {
        require(id < projectCount, "no project");
        return changes[id];
    }

    function _active(uint256 id) private view returns (Project storage p) {
        require(id < projectCount, "no project");
        p = projects[id];
        require(p.status == ACTIVE, "not active");
    }

    function _isDev(Project storage p, address who) private view returns (bool) {
        for (uint256 i = 0; i < p.devs.length; i++) {
            if (p.devs[i] == who) return true;
        }
        return false;
    }
}
