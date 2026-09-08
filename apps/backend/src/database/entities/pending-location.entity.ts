import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { PendingLocationStatus } from '@po-control-tower/shared';

/**
 * A warehouse/location name seen on an incoming PO that doesn't match anything
 * in the Location Master - queued here for ops to review instead of silently
 * defaulting to NON_LOCAL TAT forever. One row per distinct location name;
 * repeat sightings just bump occurrenceCount/lastSeenAt rather than duplicating.
 */
@Entity('pending_locations')
export class PendingLocationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  locationName: string;

  @Column({ unique: true })
  normalizedName: string;

  @Column({ type: 'varchar', nullable: true })
  platform: string | null;

  @Column({ type: 'varchar', nullable: true })
  examplePoNumber: string | null;

  @Column('int', { default: 1 })
  occurrenceCount: number;

  @Column({ type: 'enum', enum: PendingLocationStatus, default: PendingLocationStatus.PENDING })
  status: PendingLocationStatus;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdLocationId: string | null;

  @CreateDateColumn()
  firstSeenAt: Date;

  @UpdateDateColumn()
  lastSeenAt: Date;
}
