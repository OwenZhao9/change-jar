export const changeJarAbi = [
  {
    type: 'function', name: 'createProject', stateMutability: 'payable',
    inputs: [{ name: 'devs', type: 'address[]' }, { name: 'fee', type: 'uint256' }, { name: 'specHash', type: 'bytes32' }],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  { type: 'function', name: 'acknowledge', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'version', type: 'uint32' }], outputs: [] },
  {
    type: 'function', name: 'submitChange', stateMutability: 'payable',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'newSpecHash', type: 'bytes32' }, { name: 'note', type: 'string' }], outputs: [],
  },
  { type: 'function', name: 'launch', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'cancel', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'projectCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claimable', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'acknowledged', stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'uint32' }], outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'getProject', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'pm', type: 'address' },
        { name: 'devs', type: 'address[]' },
        { name: 'fee', type: 'uint256' },
        { name: 'deposit', type: 'uint256' },
        { name: 'jar', type: 'uint256' },
        { name: 'version', type: 'uint32' },
        { name: 'status', type: 'uint8' },
      ],
    }],
  },
  {
    type: 'function', name: 'getChanges', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'specHash', type: 'bytes32' },
        { name: 'note', type: 'string' },
        { name: 'fee', type: 'uint256' },
        { name: 'timestamp', type: 'uint64' },
        { name: 'paidFromDeposit', type: 'bool' },
      ],
    }],
  },
  {
    type: 'event', name: 'ProjectCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true }, { name: 'pm', type: 'address', indexed: true },
      { name: 'fee', type: 'uint256', indexed: false }, { name: 'deposit', type: 'uint256', indexed: false },
      { name: 'specHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;
