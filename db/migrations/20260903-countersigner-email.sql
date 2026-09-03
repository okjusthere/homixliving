-- Route future Homix Realty and Homix Living company signatures through the
-- shared HR mailbox while preserving Si Zhang, Broker as the legal signer.
UPDATE portal.licensed_companies
SET broker_email = 'hr@homixny.com'
WHERE id IN ('homix_realty', 'homix_living')
  AND broker_email IS DISTINCT FROM 'hr@homixny.com';
