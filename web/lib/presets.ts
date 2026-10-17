import { keccak256, toHex } from 'viem';

export const NOTES = [
  '首页主按钮改成红色',
  '登录页增加手机号验证码',
  '订单列表加上筛选和导出',
  '支付流程里增加优惠券入口',
  '个人中心整体换成深色主题',
  '消息通知改成每小时汇总',
  '搜索框支持拼音和错别字',
  '商品详情页加一个对比功能',
  '导航栏从顶部挪到左侧',
  '报表页要能按周和按月切换',
];

export const SPEC_V0 = '需求文档 v0：商城小程序首版范围';
export const specHashFor = (version: number, note: string) => keccak256(toHex(`${version}:${note}`));
export const specHashV0 = () => keccak256(toHex(SPEC_V0));
