-- Microsoft SQL Server registrar view for TapTrack direct student import.
-- The importer selects this view by SchoolYear and Semester. Adjust table and
-- field names to the registrar schema, then grant the import account SELECT
-- access to this view only.
CREATE OR ALTER VIEW dbo.vw_TapTrackStudents AS
SELECT
  LTRIM(RTRIM(S.StudentID)) AS SchoolID,
  LTRIM(RTRIM(S.LastName)) AS LastName,
  LTRIM(RTRIM(S.FirstName)) AS FirstName,
  NULLIF(LTRIM(RTRIM(S.MiddleName)), '') AS MiddleName,
  CAST(S.Birthday AS date) AS BirthDate,
  LTRIM(RTRIM(S.CourseCode)) AS CourseCode,
  LTRIM(RTRIM(SSI.YearLevel)) AS YearLevel,
  LTRIM(RTRIM(S.Gender)) AS Gender,
  NULLIF(LTRIM(RTRIM(S.InstitutionalEmail)), '') AS InstitutionalEmail,
  LTRIM(RTRIM(SSI.SchoolYear)) AS SchoolYear,
  SSI.Semester AS Semester
FROM dbo.Student AS S
INNER JOIN dbo.StudentSemestralInfo AS SSI ON SSI.StudentID = S.StudentID
WHERE SSI.IsEnrolled = 1;

-- GRANT SELECT ON dbo.vw_TapTrackStudents TO taptrack_import;
