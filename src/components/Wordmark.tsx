import { Image } from 'expo-image';

// The theatre's own white wordmark from thedreamtheatre.com (1000×200, transparent).
const SOURCE = require('../../assets/images/wordmark.png');

/** "DREAM THEATRE · Rock Performing Arts Center" logo, sized by width (5:1). */
export function Wordmark({ width = 180 }: { width?: number }) {
  return (
    <Image
      source={SOURCE}
      style={{ width, height: width / 5 }}
      contentFit="contain"
      accessibilityLabel="The Dream Theatre"
      accessibilityRole="image"
    />
  );
}
