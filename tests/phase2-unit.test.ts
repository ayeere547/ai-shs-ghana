import { describe, expect, it } from "vitest";

import { computeResults, gradeFor, ordinal, resultsCsv } from "@/lib/results/compute";
import { parseCsv, validateImport } from "@/lib/students/schema";
import { findClashes, generateTimetable } from "@/lib/timetable/generate";

const C1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  });
});

describe("student import validation", () => {
  const ctx = {
    classes: [{ id: C1, name: "1 Science A" }],
    programmes: [{ id: P1, name: "General Science" }],
    houses: [],
    existing: [{ student_number: "SRS/26/00001", first_name: "Ama", last_name: "Mensah", date_of_birth: "2010-03-14" }],
  };
  const header = "student_number,first_name,last_name,gender,date_of_birth,class,programme,residency,guardian_name,guardian_phone,guardian_relationship";

  it("accepts valid rows and resolves class/programme names case-insensitively", () => {
    const { rows } = validateImport(`${header}\n,Kofi,Owusu,M,2010-05-01,1 science a,GENERAL SCIENCE,boarding,Yaw Owusu,+233 24 111 1111,Father`, ctx);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].duplicate).toBeUndefined();
    expect(rows[0].data).toMatchObject({ first_name: "Kofi", gender: "male", class_id: C1, programme_id: P1, residency: "boarding" });
    expect(rows[0].guardian).toEqual({ full_name: "Yaw Owusu", phone: "+233 24 111 1111", relationship: "father" });
  });

  it("reports unknown classes, invalid values and missing names with line numbers", () => {
    const { rows } = validateImport(`${header}\n,,Owusu,x,2010-13-40,2 Arts Z,,,,,`, ctx);
    expect(rows[0].line).toBe(2);
    expect(rows[0].errors.join(" ")).toMatch(/first name/i);
    expect(rows[0].errors.join(" ")).toMatch(/Unknown class/);
  });

  it("detects duplicates against existing records and within the file", () => {
    const { rows } = validateImport(
      `${header}\nSRS/26/00001,Esi,Boateng,F,,,,,,,\n,Ama,Mensah,F,2010-03-14,,,,,,\n,Abena,Asante,F,2011-01-01,,,,,,\n,abena,ASANTE,F,2011-01-01,,,,,,`,
      ctx,
    );
    expect(rows.map((r) => r.duplicate)).toEqual([
      "Student number SRS/26/00001 already exists",
      "A student with the same name and date of birth already exists",
      undefined,
      "Same name and date of birth as row 4",
    ]);
  });

  it("rejects files without the required columns", () => {
    expect(validateImport("name,class\nA,B", ctx).headerError).toMatch(/first_name, last_name, gender/);
  });
});

describe("timetable generator", () => {
  const days = [1, 2, 3, 4, 5];
  const periods = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const demands = ["c1", "c2", "c3"].flatMap((c) => [
    { classId: c, subjectId: "maths", staffId: "t-maths", periodsPerWeek: 5 },
    { classId: c, subjectId: "english", staffId: "t-eng", periodsPerWeek: 5 },
    { classId: c, subjectId: "science", staffId: `t-sci-${c}`, periodsPerWeek: 4 },
    { classId: c, subjectId: "social", staffId: null, periodsPerWeek: 3 },
  ]);

  it("places every lesson with no class or teacher clashes", () => {
    const { slots, unplaced } = generateTimetable({ days, periodIds: periods, demands });
    expect(unplaced).toEqual([]);
    expect(slots).toHaveLength(3 * (5 + 5 + 4 + 3));
    expect(findClashes(slots)).toEqual([]);
  });

  it("spreads a subject across days before doubling up", () => {
    const { slots } = generateTimetable({ days, periodIds: periods, demands });
    const mathsDays = slots.filter((s) => s.classId === "c1" && s.subjectId === "maths").map((s) => s.day);
    expect(new Set(mathsDays).size).toBe(5);
  });

  it("reports what cannot fit instead of double-booking", () => {
    const overloaded = [
      { classId: "a", subjectId: "x", staffId: "t", periodsPerWeek: 2 },
      { classId: "b", subjectId: "x", staffId: "t", periodsPerWeek: 2 },
    ];
    const { slots, unplaced } = generateTimetable({ days: [1], periodIds: ["p1", "p2", "p3"], demands: overloaded });
    expect(findClashes(slots)).toEqual([]);
    expect(unplaced.reduce((n, u) => n + u.missing, 0)).toBe(1);
  });

  it("respects fixed slots", () => {
    const fixed = [{ classId: "c1", subjectId: "assembly", staffId: "t-maths", day: 1, periodId: "p1" }];
    const { slots } = generateTimetable({ days, periodIds: periods, demands, fixed });
    expect(findClashes([...fixed, ...slots])).toEqual([]);
  });
});

describe("results", () => {
  const bands = [
    { grade: "A", min_score: 80, max_score: 100, remark: "Excellent" },
    { grade: "B", min_score: 70, max_score: 79.99, remark: "Very good" },
    { grade: "F", min_score: 0, max_score: 69.99, remark: "Below" },
  ];
  const assessments = [
    { id: "t1", subject_id: "m", max_score: 20, weight: 30 },
    { id: "ex", subject_id: "m", max_score: 100, weight: 70 },
    { id: "e1", subject_id: "e", max_score: 50, weight: 100 },
  ];

  it("weights assessments, grades by the school's bands and ranks with ties", () => {
    const res = computeResults({
      studentIds: ["s1", "s2", "s3", "s4"],
      assessments,
      bands,
      scores: [
        { assessment_id: "t1", student_id: "s1", score: 20 }, { assessment_id: "ex", student_id: "s1", score: 80 }, { assessment_id: "e1", student_id: "s1", score: 40 },
        { assessment_id: "t1", student_id: "s2", score: 10 }, { assessment_id: "ex", student_id: "s2", score: 90 }, { assessment_id: "e1", student_id: "s2", score: 40 },
        { assessment_id: "t1", student_id: "s3", score: 20 }, { assessment_id: "ex", student_id: "s3", score: 80 }, { assessment_id: "e1", student_id: "s3", score: 40 },
      ],
    });
    const s1 = res.find((r) => r.studentId === "s1")!;
    expect(s1.subjects.m).toEqual({ total: 86, grade: "A", remark: "Excellent", incomplete: false }); // 30 + 56
    expect(s1.subjects.e.total).toBe(80);
    expect(res.find((r) => r.studentId === "s2")!.subjects.m.total).toBe(78); // 15 + 63
    expect(res.map((r) => r.position)).toEqual([1, 3, 1, null]); // s1 and s3 tie; s4 has no scores
  });

  it("flags incomplete subjects and optionally counts missing scores as zero", () => {
    const scores = [{ assessment_id: "ex", student_id: "s1", score: 50 }];
    const [lenient] = computeResults({ studentIds: ["s1"], assessments, bands, scores });
    expect(lenient.subjects.m).toMatchObject({ total: 50, incomplete: true });
    const [strict] = computeResults({ studentIds: ["s1"], assessments, bands, scores, missingAsZero: true });
    expect(strict.subjects.m.total).toBe(35);
  });

  it("grades boundaries correctly", () => {
    expect(gradeFor(79.99, bands).grade).toBe("B");
    expect(gradeFor(80, bands).grade).toBe("A");
  });

  it("formats ordinals and safe CSV", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
    expect(resultsCsv(["Name", "Note"], [["=HYPERLINK(x)", 'a "b", c']])).toBe(`Name,Note\r\n'=HYPERLINK(x),"a ""b"", c"`);
  });
});
