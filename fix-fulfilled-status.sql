-- Fix existing fulfilled requests
-- Update blood_requests.status to 'fulfilled' where request_hospitals.status is 'fulfilled'

UPDATE blood_requests 
SET status = 'fulfilled' 
WHERE request_id IN (
  SELECT DISTINCT request_id 
  FROM request_hospitals 
  WHERE status = 'fulfilled'
);

-- Verify the update
SELECT 
  br.request_id, 
  br.patient_name, 
  br.status as request_status, 
  rh.hospital_id, 
  rh.status as hospital_status 
FROM blood_requests br 
LEFT JOIN request_hospitals rh ON br.request_id = rh.request_id 
ORDER BY br.created_at DESC;
