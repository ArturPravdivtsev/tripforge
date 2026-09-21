import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  CreateDocumentUploadResponse,
  TripDocument,
  TripDocumentDownload,
} from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CreateDocumentUploadDto } from "./dto/create-document-upload.dto";
import { UpdateTripDocumentDto } from "./dto/update-trip-document.dto";
import { TripDocumentsService } from "./trip-documents.service";

@Controller("trips/:tripId/documents")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripDocumentsController {
  constructor(private readonly documents: TripDocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripDocument[]> {
    return this.documents.list(user.id, tripId);
  }

  @Post("uploads")
  @RequireJsonBody()
  createUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: CreateDocumentUploadDto,
  ): Promise<CreateDocumentUploadResponse> {
    return this.documents.createUpload(user.id, tripId, input);
  }

  @Post(":documentId/complete")
  @RequireJsonBody()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<TripDocument> {
    return this.documents.complete(user.id, tripId, documentId);
  }

  @Get(":documentId/download")
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<TripDocumentDownload> {
    return this.documents.download(user.id, tripId, documentId);
  }

  @Patch(":documentId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: UpdateTripDocumentDto,
  ): Promise<TripDocument> {
    return this.documents.update(user.id, tripId, documentId, input);
  }

  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    return this.documents.delete(user.id, tripId, documentId);
  }
}
