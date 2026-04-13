import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.header(HEADER_REQUEST_ID) ?? randomUUID();
    req.headers[HEADER_REQUEST_ID] = requestId;
    res.setHeader(HEADER_REQUEST_ID, requestId);
    next();
  }
}

