import { Composition } from "remotion";
import { Video } from "../Video";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Video}
    durationInFrames={150}
    fps={30}
    width={2560}
    height={1440}
    defaultProps={{ title: "Halo Remotion", scale: 1 }}
  />
);
