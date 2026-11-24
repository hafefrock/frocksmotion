import { CalculateMetadataFunction, Composition } from "remotion";
import { Video, VideoProps } from "../Video";
import { FPS, canvasOf, defaultProject } from "../types";

const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => {
  const c = canvasOf(props.project.ratio);
  return {
    durationInFrames: Math.max(1, Math.round(props.project.duration * FPS)),
    width: c.w,
    height: c.h,
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Video}
    durationInFrames={150}
    fps={FPS}
    width={2560}
    height={1440}
    defaultProps={{ project: defaultProject, scale: 1 }}
    calculateMetadata={calculateMetadata}
  />
);
