import { CalculateMetadataFunction, Composition } from "remotion";
import { Video, VideoProps } from "../Video";
import { FPS, FULL_H, FULL_W, defaultProject } from "../types";

const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.project.duration * FPS)),
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Video}
    durationInFrames={150}
    fps={FPS}
    width={FULL_W}
    height={FULL_H}
    defaultProps={{ project: defaultProject, scale: 1 }}
    calculateMetadata={calculateMetadata}
  />
);
