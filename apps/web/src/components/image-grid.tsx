import { useState } from "react";
import type { ApiClient } from "../api/client";
import { Link } from "../router";
import type { ImageSummary } from "../types";
import { StarIcon } from "./icons";
import { GenerationStatusBadge } from "./status";

export function ImageGrid({
  items,
  api,
  onMutation,
}: {
  items: ImageSummary[];
  api: ApiClient;
  onMutation: () => void;
}) {
  return (
    <ol className="image-grid" aria-label="Image results">
      {items.map((image, index) => (
        <ImageCard
          image={image}
          index={index}
          api={api}
          onMutation={onMutation}
          key={image.sha256}
        />
      ))}
    </ol>
  );
}

function ImageCard({
  image,
  index,
  api,
  onMutation,
}: {
  image: ImageSummary;
  index: number;
  api: ApiClient;
  onMutation: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const width = image.width ?? 4;
  const height = image.height ?? 3;
  const aspectClass = aspectRatioClass(width, height);
  const alt = image.note || `Generated image from ${image.creationTitle || "untitled creation"}`;

  const toggleFavorite = async () => {
    setPending(true);
    setError(undefined);
    try {
      await api.patchImageCuration(image.sha256, {
        expectedRevision: image.entityRevision,
        patch: { favorite: !image.favorite },
      });
      onMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Favorite could not be updated.");
    } finally {
      setPending(false);
    }
  };

  return (
    <li className={`image-card ${aspectClass}`}>
      <Link to={`/images/${image.sha256}`} className="image-card-link">
        <img
          src={`/api/v1/images/${image.sha256}/content?variant=thumbnail`}
          alt={alt}
          width={width}
          height={height}
          loading={index < 8 ? "eager" : "lazy"}
        />
        <span className="frame-number" aria-hidden="true">
          {String(index + 1).padStart(3, "0")}
        </span>
      </Link>
      <button
        className="card-favorite icon-button"
        aria-label={image.favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={image.favorite}
        disabled={pending}
        onClick={() => void toggleFavorite()}
      >
        <StarIcon filled={image.favorite} />
      </button>
      <div className="image-card-meta">
        <div>
          <strong>{image.creationTitle || "Imported reference"}</strong>
          <time dateTime={image.createdAt}>{formatDate(image.createdAt)}</time>
        </div>
        <div className="card-meta-row">
          {image.generationStatus && <GenerationStatusBadge status={image.generationStatus} />}
          {image.rating !== null && (
            <span aria-label={`Rated ${image.rating} out of 5`}>{image.rating}/5</span>
          )}
        </div>
        {image.tags.length > 0 && (
          <p className="tag-summary">{image.tags.slice(0, 3).join(" · ")}</p>
        )}
        {error && (
          <p className="card-error" role="status">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function aspectRatioClass(width: number, height: number): string {
  const ratio = height / width;
  if (ratio >= 1.65) return "image-card--tall";
  if (ratio >= 1.12) return "image-card--portrait";
  if (ratio <= 0.72) return "image-card--wide";
  if (ratio <= 0.92) return "image-card--landscape";
  return "image-card--square";
}
