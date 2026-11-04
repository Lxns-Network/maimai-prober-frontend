import { useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Box, Button, Group, Modal, Slider } from "@mantine/core";
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { openAlertModal } from "@/utils/modal";

const OUTPUT_SIZE = 512;

/**
 * 把裁剪区域导出为不超过 512px 的正方形图片。
 * 浏览器不支持 WebP 编码时 `toBlob` 会回退为 PNG，后端两种格式都接受。
 */
const exportCroppedImage = async (src: string, area: Area): Promise<File> => {
  const image = new Image();
  image.src = src;
  await image.decode();

  const size = Math.min(OUTPUT_SIZE, Math.round(area.width));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片处理");
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("图片导出失败");
  return new File([blob], blob.type === "image/webp" ? "avatar.webp" : "avatar.png", {
    type: blob.type,
  });
};

interface AvatarCropModalProps {
  opened: boolean;
  image: string | null;
  uploading: boolean;
  onClose(): void;
  onExited(): void;
  onConfirm(file: File): void;
}

export const AvatarCropModal = ({
  opened,
  image,
  uploading,
  onClose,
  onExited,
  onConfirm,
}: AvatarCropModalProps) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [exporting, setExporting] = useState(false);

  const confirm = async () => {
    if (!image || !area) return;
    setExporting(true);
    try {
      onConfirm(await exportCroppedImage(image, area));
    } catch (error) {
      openAlertModal("头像处理失败", `${error}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      onExitTransitionEnd={() => {
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setArea(null);
        onExited();
      }}
      title="更换头像"
      centered
    >
      <Box pos="relative" h={300} bg="black">
        {image && (
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        )}
      </Box>
      <Group gap="xs" mt="md" wrap="nowrap" c="dimmed">
        <IconZoomOut size={18} stroke={1.5} />
        <Slider
          flex={1}
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={setZoom}
          label={null}
          aria-label="缩放"
        />
        <IconZoomIn size={18} stroke={1.5} />
      </Group>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          取消
        </Button>
        <Button loading={exporting || uploading} disabled={!area} onClick={() => void confirm()}>
          上传
        </Button>
      </Group>
    </Modal>
  );
};
