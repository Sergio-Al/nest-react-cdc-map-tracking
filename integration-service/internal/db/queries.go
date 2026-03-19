package db

import (
	"database/sql"
	"fmt"
)

// Queries holds prepared statements for all entity inserts.
type Queries struct {
	insertCustomer *sql.Stmt
	insertDriver   *sql.Stmt
}

func PrepareQueries(db *sql.DB) (*Queries, error) {
	insertCustomer, err := db.Prepare(`
		INSERT INTO customers
			(tenant_id, name, phone, email, address, latitude, longitude, geofence_radius_meters, customer_type)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return nil, fmt.Errorf("prepare insertCustomer: %w", err)
	}

	insertDriver, err := db.Prepare(`
		INSERT INTO drivers
			(id, tenant_id, name, device_id, phone, vehicle_plate, vehicle_type, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		insertCustomer.Close()
		return nil, fmt.Errorf("prepare insertDriver: %w", err)
	}

	return &Queries{
		insertCustomer: insertCustomer,
		insertDriver:   insertDriver,
	}, nil
}

func (q *Queries) InsertCustomer(
	tenantID, name string,
	phone, email, address *string,
	latitude, longitude *float64,
	geofenceRadiusMeters int,
	customerType string,
) (int64, error) {
	res, err := q.insertCustomer.Exec(
		tenantID, name, phone, email, address, latitude, longitude,
		geofenceRadiusMeters, customerType,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (q *Queries) InsertDriver(
	id, tenantID, name string,
	deviceID, phone, vehiclePlate *string,
	vehicleType, status string,
) error {
	_, err := q.insertDriver.Exec(
		id, tenantID, name, deviceID, phone, vehiclePlate, vehicleType, status,
	)
	return err
}

func (q *Queries) Close() {
	q.insertCustomer.Close()
	q.insertDriver.Close()
}
