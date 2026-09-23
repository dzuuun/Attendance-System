-- Microsoft SQL Server registrar view for TapTrack direct student import.
-- Photo may be image or varbinary data containing JPEG, PNG, or WebP. Grant
-- the import account SELECT access to this view only.
CREATE OR ALTER VIEW dbo.vw_TapTrackStudents AS
SELECT
  LTRIM(RTRIM(S.StudentID)) AS SchoolID,
  LTRIM(RTRIM(S.LastName)) AS LastName,
  LTRIM(RTRIM(S.FirstName)) AS FirstName,
  NULLIF(LTRIM(RTRIM(S.MiddleName)), '') AS MiddleName,
  S.Birthday AS BirthDate,
  LTRIM(RTRIM(S.CourseCode)) AS CourseCode,
  LTRIM(RTRIM(b.YearLevel)) AS YearLevel,
  NULLIF(LTRIM(RTRIM(b.[Section])), '') AS SectionName,
  CASE UPPER(LTRIM(RTRIM(S.Sex)))
    WHEN 'M' THEN 'Male'
    WHEN 'MALE' THEN 'Male'
    WHEN 'F' THEN 'Female'
    WHEN 'FEMALE' THEN 'Female'
    ELSE LTRIM(RTRIM(S.Sex))
  END AS Gender,
  CAST(NULL AS varchar(254)) AS InstitutionalEmail,
  S.Photo AS Photo,
  LTRIM(RTRIM(b.SchoolYear)) AS SchoolYear,
  b.Semester
FROM dbo.Student AS S
INNER JOIN dbo.StudentSemestralInfo AS b
  ON b.StudentID = S.StudentID
INNER JOIN dbo.Course AS Co
  ON Co.CourseCode = S.CourseCode
INNER JOIN dbo.Department AS f
  ON f.DeptCode = Co.DeptCode
WHERE b.IsEnrolled = 1
  AND EXISTS (
    SELECT 1
    FROM dbo.StudentLoad AS c
    INNER JOIN dbo.Schedule AS d
      ON d.ScheduleCode = c.ScheduleCode
    INNER JOIN dbo.Subject AS e
      ON e.SubjectCode = d.SubjectCode
    WHERE c.StudentID = b.StudentID
      AND c.SchoolYear = b.SchoolYear
      AND c.Semester = b.Semester
  );
GO

-- GRANT SELECT ON dbo.vw_TapTrackStudents TO taptrack_import;
