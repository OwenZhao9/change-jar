// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ChangeJar} from "../src/ChangeJar.sol";

/// 部署：PRIVATE_KEY 只从环境变量读取，不写进任何文件。
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        ChangeJar jar = new ChangeJar();
        vm.stopBroadcast();
        console.log("ChangeJar deployed at", address(jar));
    }
}
