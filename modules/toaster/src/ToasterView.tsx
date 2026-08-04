import * as React from 'react';
import { View } from "react-native";

import { ToasterViewProps } from './Toaster.types';

export default function ToasterView(props: ToasterViewProps) {
  // Toaster 模块仅用于 Toast，模板遗留的 NativeView 已移除。
  // 为避免误用导致运行时崩溃，这里返回一个空 View 占位。
  return <View style={props.style} />;
}
