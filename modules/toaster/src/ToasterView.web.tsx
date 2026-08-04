import * as React from 'react';

import { ToasterViewProps } from './Toaster.types';

export default function ToasterView(props: ToasterViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
