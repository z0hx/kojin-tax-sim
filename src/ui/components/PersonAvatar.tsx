interface PersonAvatarProps {
  displayName: string;
  color: string;
  size?: number;
}

/** 識別色付きの丸アバター。表示名の先頭1文字を表示する(02仕様書§5 共通ヘッダー) */
export function PersonAvatar({ displayName, color, size = 28 }: PersonAvatarProps) {
  const initial = displayName.trim().charAt(0) || '?';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: '#ffffff',
        fontSize: size * 0.5,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}
