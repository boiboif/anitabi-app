import { Text, View } from 'tamagui';

type Props = {
  sequenceNumber: number;
};

export default function PointSequenceBadge({ sequenceNumber }: Props) {
  return (
    <View
      position="absolute"
      t="0-5"
      l="0-5"
      z={2}
      w={22}
      h={22}
      rounded={34}
      items="center"
      justify="center"
      backgroundImage="linear-gradient(145deg, #FF9DBA 0%, #FB7299 52%, #E85280 100%)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.72)"
    >
      <Text
        fontSize={sequenceNumber >= 100 ? 8 : sequenceNumber >= 10 ? 9 : 10}
        lineHeight="12px"
        fontWeight="800"
        color="white"
        fontVariant={['tabular-nums']}
      >
        {sequenceNumber}
      </Text>
    </View>
  );
}
