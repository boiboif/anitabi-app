import { Text, View } from 'tamagui';

type Props = {
  sequenceNumber: number;
};

export default function PointSequenceBadge({ sequenceNumber }: Props) {
  return (
    <View
      position="absolute"
      t="$1"
      l="$1"
      z={2}
      width={22}
      height={22}
      rounded="$10"
      items="center"
      justify="center"
      backgroundImage="linear-gradient(145deg, #FF9DBA 0%, #FB7299 52%, #E85280 100%)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.72)"
      boxShadow="0 1px 4px rgba(111,20,53,0.32)"
    >
      <Text
        fontSize={sequenceNumber >= 100 ? 8 : sequenceNumber >= 10 ? 9 : 10}
        lineHeight={12}
        fontWeight="800"
        color="white"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {sequenceNumber}
      </Text>
    </View>
  );
}
