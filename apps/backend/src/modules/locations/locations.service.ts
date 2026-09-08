import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationMasterEntity } from '../../database/entities/location-master.entity';
import { PendingLocationEntity } from '../../database/entities/pending-location.entity';
import { ExceptionType, LocationType, PendingLocationStatus } from '@po-control-tower/shared';
import { ExceptionsService } from '../exceptions/exceptions.service';

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface ApprovePendingLocationInput {
  locationName?: string;
  warehouseCode: string;
  city?: string;
  state?: string;
  platform?: string;
  locationType: LocationType;
  localTatHours?: number;
  nonLocalTatMinDays?: number;
  nonLocalTatMaxDays?: number;
  tatRuleDescription?: string;
}

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(LocationMasterEntity)
    private readonly locationRepository: Repository<LocationMasterEntity>,
    @InjectRepository(PendingLocationEntity)
    private readonly pendingLocationRepository: Repository<PendingLocationEntity>,
    private readonly exceptionsService: ExceptionsService,
  ) {}

  list(): Promise<LocationMasterEntity[]> {
    return this.locationRepository.find({ order: { locationName: 'ASC' } });
  }

  create(data: Partial<LocationMasterEntity>): Promise<LocationMasterEntity> {
    return this.locationRepository.save(this.locationRepository.create(data));
  }

  async update(id: string, data: Partial<LocationMasterEntity>): Promise<LocationMasterEntity | null> {
    await this.locationRepository.update(id, data);
    return this.locationRepository.findOneBy({ id });
  }

  /**
   * Fuzzy-matches a warehouse/location string from an uploaded file (or manual
   * PO entry) against the Location Master. The Location Master is always the
   * source of truth for LOCAL/NON-LOCAL - an unmatched location defaults to
   * NON_LOCAL (the safer, longer-buffer assumption) and the caller should raise
   * an UNKNOWN_WAREHOUSE exception so it gets added properly.
   */
  async classify(rawLocationName: string): Promise<{ location: LocationMasterEntity | null; matched: boolean }> {
    if (!rawLocationName) return { location: null, matched: false };
    const all = await this.locationRepository.find({ where: { isActive: true } });
    const target = normalize(rawLocationName);

    const exact = all.find(
      (l) => normalize(l.locationName) === target || normalize(l.warehouseCode) === target,
    );
    if (exact) return { location: exact, matched: true };

    const partial = all.find(
      (l) =>
        target.includes(normalize(l.warehouseCode)) ||
        normalize(l.warehouseCode).includes(target) ||
        target.includes(normalize(l.locationName)) ||
        normalize(l.locationName).includes(target),
    );
    if (partial) return { location: partial, matched: true };

    return { location: null, matched: false };
  }

  defaultNonLocal(): { locationType: LocationType; nonLocalTatMinDays: number; nonLocalTatMaxDays: number } {
    return { locationType: LocationType.NON_LOCAL, nonLocalTatMinDays: 10, nonLocalTatMaxDays: 8 };
  }

  /**
   * Called whenever a PO references a warehouse name that doesn't match the
   * Location Master - queues it for approval instead of letting it silently
   * ride on the NON_LOCAL default forever. A no-op if it already matches, or
   * if it's already queued/approved/rejected (repeat sightings just bump the
   * occurrence count on a still-PENDING row).
   */
  async recordPendingLocation(rawLocationName: string, platform: string | null, poNumber: string | null): Promise<void> {
    if (!rawLocationName) return;
    const { matched } = await this.classify(rawLocationName);
    if (matched) return;

    const normalizedName = normalize(rawLocationName);
    const existing = await this.pendingLocationRepository.findOne({ where: { normalizedName } });
    if (existing) {
      if (existing.status === PendingLocationStatus.PENDING) {
        await this.pendingLocationRepository.update(existing.id, {
          occurrenceCount: existing.occurrenceCount + 1,
          platform: platform ?? existing.platform,
          examplePoNumber: poNumber ?? existing.examplePoNumber,
        });
      }
      return;
    }

    await this.pendingLocationRepository.save(
      this.pendingLocationRepository.create({
        locationName: rawLocationName,
        normalizedName,
        platform: platform ?? null,
        examplePoNumber: poNumber ?? null,
        occurrenceCount: 1,
        status: PendingLocationStatus.PENDING,
      }),
    );
  }

  listPendingLocations(status?: PendingLocationStatus): Promise<PendingLocationEntity[]> {
    return this.pendingLocationRepository.find({
      where: status ? { status } : {},
      order: { lastSeenAt: 'DESC' },
    });
  }

  async approvePendingLocation(
    id: string,
    userId: string,
    data: ApprovePendingLocationInput,
  ): Promise<{ location: LocationMasterEntity; resolvedExceptions: number }> {
    const pending = await this.pendingLocationRepository.findOneBy({ id });
    if (!pending) throw new NotFoundException(`Pending location ${id} not found`);

    const location = await this.create({
      locationName: data.locationName || pending.locationName,
      warehouseCode: data.warehouseCode,
      city: data.city,
      state: data.state,
      platform: data.platform ?? pending.platform,
      locationType: data.locationType,
      localTatHours: data.localTatHours,
      nonLocalTatMinDays: data.nonLocalTatMinDays,
      nonLocalTatMaxDays: data.nonLocalTatMaxDays,
      tatRuleDescription:
        data.tatRuleDescription ||
        (data.locationType === LocationType.LOCAL
          ? `Local TAT: ${data.localTatHours} Hours`
          : `${data.nonLocalTatMaxDays}-${data.nonLocalTatMinDays} Days before expiry`),
    });

    await this.pendingLocationRepository.update(id, {
      status: PendingLocationStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedByUserId: userId,
      createdLocationId: location.id,
    });

    // The root cause (warehouse name unrecognized) is now fixed - every OPEN
    // UNKNOWN_WAREHOUSE exception raised for this same location name (however
    // it was capitalized/spaced across different upload rows) is resolved
    // along with it, instead of sitting open forever waiting for someone to
    // notice the location got added.
    const resolvedExceptions = await this.exceptionsService.resolveOpenByTypeAndWarehouse(
      ExceptionType.UNKNOWN_WAREHOUSE,
      (warehouse) => normalize(warehouse) === pending.normalizedName,
      `Location "${location.locationName}" (${location.warehouseCode}) was approved and added to the Location Master.`,
    );

    return { location, resolvedExceptions };
  }

  /**
   * Backfill/repair sweep: resolves any still-OPEN UNKNOWN_WAREHOUSE exceptions
   * for locations that were already APPROVED before this auto-resolve behavior
   * existed (or if a resolution attempt ever failed partway). Safe to call
   * repeatedly - it only ever touches exceptions still sitting OPEN.
   */
  async reconcileApprovedLocationExceptions(): Promise<{ locationsChecked: number; resolvedExceptions: number }> {
    const approved = await this.pendingLocationRepository.find({ where: { status: PendingLocationStatus.APPROVED } });
    let resolvedExceptions = 0;
    for (const pending of approved) {
      const location = pending.createdLocationId ? await this.locationRepository.findOneBy({ id: pending.createdLocationId }) : null;
      resolvedExceptions += await this.exceptionsService.resolveOpenByTypeAndWarehouse(
        ExceptionType.UNKNOWN_WAREHOUSE,
        (warehouse) => normalize(warehouse) === pending.normalizedName,
        `Location "${pending.locationName}"${location ? ` (${location.warehouseCode})` : ''} was approved and added to the Location Master.`,
      );
    }
    return { locationsChecked: approved.length, resolvedExceptions };
  }

  async rejectPendingLocation(id: string, userId: string): Promise<void> {
    const pending = await this.pendingLocationRepository.findOneBy({ id });
    if (!pending) throw new NotFoundException(`Pending location ${id} not found`);
    await this.pendingLocationRepository.update(id, {
      status: PendingLocationStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedByUserId: userId,
    });
  }
}
