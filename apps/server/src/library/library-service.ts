import { createHash } from "node:crypto";
import type {
  CreationDetail,
  GenerationView,
  GalleryResponse,
  ImageDetail,
  ImageSummary,
} from "@text-to-image/api-contract";
import type { GalleryQuery, IndexedGeneration } from "@text-to-image/read-model";
import type { ReadModel } from "@text-to-image/read-model";
import type { ArchivePort } from "../shared/archive-port.js";
import { NotFoundError } from "../shared/errors.js";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function toGeneration(value: IndexedGeneration): GenerationView {
  return value;
}

function toImageSummary(value: ReturnType<ReadModel["listGallery"]>["items"][number]): ImageSummary {
  return value;
}

export class LibraryService {
  constructor(
    readonly archive: ArchivePort,
    readonly readModel: ReadModel,
  ) {}

  gallery(query: GalleryQuery): GalleryResponse {
    const result = this.readModel.listGallery(query);
    return {
      items: result.items.map(toImageSummary),
      page: { nextCursor: result.nextCursor, total: result.total },
    };
  }

  references(query: GalleryQuery): GalleryResponse {
    const result = this.readModel.listReferences(query);
    return {
      items: result.items.map(toImageSummary),
      page: { nextCursor: result.nextCursor, total: result.total },
    };
  }

  async creation(id: string): Promise<CreationDetail> {
    const creation = this.readModel.getCreation(id);
    if (!creation) throw new NotFoundError("Creation", id);
    const draft = await this.readModel.readDraft(id);
    const metadata = draft.metadata ?? {};
    const observed = typeof metadata.observedContentSha256 === "string" ? metadata.observedContentSha256 : "";
    return {
      ...creation,
      draft: {
        content: draft.content,
        contentSha256: hash(draft.content),
        basedOnRevisionId: typeof metadata.basedOnRevisionId === "string" ? metadata.basedOnRevisionId : null,
        updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : null,
        externalEdit: observed !== hash(draft.content),
      },
      revisions: this.readModel.getRevisions(id),
      generations: this.readModel.getGenerations(id).map(toGeneration),
    };
  }

  generation(id: string): GenerationView {
    const generation = this.readModel.getGeneration(id);
    if (!generation) throw new NotFoundError("Generation", id);
    const prompt = this.readModel
      .getRevisions(generation.creationId)
      .find((revision) => revision.id === generation.promptRevisionId);
    return prompt ? { ...toGeneration(generation), prompt } : toGeneration(generation);
  }

  image(sha256: string): ImageDetail {
    const image = this.readModel.getImage(sha256);
    if (!image) throw new NotFoundError("Image Asset", sha256);
    const producing = image.generationId ? this.readModel.getGeneration(image.generationId) : null;
    return {
      ...toImageSummary(image),
      producingGeneration: producing ? toGeneration(producing) : null,
      usedAsReference: this.readModel.getReferenceRelations(sha256).map((relation) => ({
        ...relation,
        roles: relation.roles as ImageDetail["usedAsReference"][number]["roles"],
      })),
    };
  }
}
