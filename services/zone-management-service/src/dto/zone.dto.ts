import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { ZONE_STATUSES, ZONE_TYPES } from "@qoms/shared";

export class ZoneRulesDto {
  @IsBoolean()
  queueEnabled!: boolean;

  @IsBoolean()
  reservationEnabled!: boolean;

  @IsInt()
  @Min(1)
  overloadThresholdPct!: number;

  @IsInt()
  @Min(1)
  estimatedServiceMinutesPerPerson!: number;

  @IsInt()
  @Min(15)
  reservationSlotMinutes!: number;

  @IsInt()
  @Min(1)
  reservationWindowDays!: number;

  @IsInt()
  @Min(1)
  maxQueueSize!: number;
}

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(ZONE_TYPES)
  type!: (typeof ZONE_TYPES)[number];

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  @IsIn(ZONE_STATUSES)
  status?: (typeof ZONE_STATUSES)[number];

  @IsObject()
  @ValidateNested()
  @Type(() => ZoneRulesDto)
  rules!: ZoneRulesDto;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @IsIn(ZONE_STATUSES)
  status?: (typeof ZONE_STATUSES)[number];
}

export class UpdateZoneRulesDto {
  @IsOptional()
  @IsBoolean()
  queueEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reservationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  overloadThresholdPct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedServiceMinutesPerPerson?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  reservationSlotMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  reservationWindowDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxQueueSize?: number;
}

