import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { LocationType } from '@po-control-tower/shared';

/**
 * Source of truth for LOCAL vs NON-LOCAL dispatch TAT classification.
 * Never hard-code a warehouse's classification in calculation logic - always
 * look it up here, so ops can change TAT rules without a code deploy.
 */
@Entity('location_masters')
export class LocationMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  locationName: string;

  @Column({ unique: true })
  warehouseCode: string;

  /** Channel/platform this location was first sourced from (e.g. "Blinkit") - purely informational traceability, not used in TAT logic. */
  @Column({ type: 'varchar', nullable: true })
  platform: string | null;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ type: 'enum', enum: LocationType, default: LocationType.NON_LOCAL })
  locationType: LocationType;

  @Column({ type: 'int', nullable: true, default: 48 })
  localTatHours: number;

  @Column({ type: 'int', nullable: true, default: 10 })
  nonLocalTatMinDays: number;

  @Column({ type: 'int', nullable: true, default: 8 })
  nonLocalTatMaxDays: number;

  @Column({ nullable: true })
  tatRuleDescription: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
