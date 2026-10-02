// Demo/institution login data for Nexa Learn.
// Passwords are intentionally fixed for this prototype, as requested.
const STUDENT_PASSWORD = 'Srcas@2026';
const FACULTY_PASSWORD = 'Faculty@srcas';

const attendance = [89.7,93.1,89.7,90.5,83.6,92.2,68.1,95.7,84.5,83.6,62.9,94.8,79.3,88.8,93.1,90.5,95.7,90.5,91.4,88.8,91.4,87.9,79.3,93.1,89.7,85.3,86.2,86.2,84.5,86.2,88.8,75.9,78.4,93.1,88.8,67.2,80.2,94.8,74.1,92.2,88.8,88.8,96.6,81.9,98.3,94.0,78.4,65.5,91.4,77.6,83.6,91.4,82.8,88.8,78.4,76.7,75.0,60.3,89.7,81.9,81.9,75.9,83.6,92.2,25.0,84.5];

const names = [
  'ABIMAN GOWTHAM A','ACHUTHAN R','AISHWARYA S','AJAY KUMAR P','ANISHR AHAMAN R','ARTHIR','BALAMURUGAN A','CHIRANJEEVI P','DHARANEEJ','DINESH P','FAIZAN M','GOPIKA G','HARIKRISHNAN B','HARINI K','HARISH R','HARISH KUMAR D','INFANTA MONCY A','JANARTHANABABU T J','JEEVANANTHAM S','JYOOSHIKA SHRIR','KARTHICKA A','KARTHIKAYINI S','KAVI SRI K','KAVIYARASU P','KEERTHANA K','KISHORE KUMAR R','KISHORE R','LINKESWARAN V','MADESH C','MITHRA R','MOTHI S R','MOUNATHESWARS','MUKESH T',
  'MUNNA J','MUTHUPRAJESHWAR M K','NASIF SULTHAN M','NITHIN KARTHIKEYAN K','NITHISH KUMAR R','PERINBA SELVAN U','PRAGHUL KANNAN L','PRANESH C J','PRAVEENA S','PREETHI BAI G','PRITHIKSHA S','PRITHVI RAM D G','RAKSHANA G','RATCHANAS','RAYAN K','RITHIKROSHAN R','RITHUL SINGH R','SADHANA K','SAHANA S','SAHANAAM M','SANJAY V','SANTHOSH P','SARAN R','SARANYAA A','SARAVANAKUMAR S','SHARMILA V','SKANTHAGURU B','SRI HARINI S','SRIRAM V','SURYA PRAKASH P','VAISHAK J','VARSHINI V','YOGESHWARAN N'
];

const students = names.map((name, index) => ({
  regNumber: `26U201${String(67 + index).padStart(3, '0')}`,
  name,
  className: 'I BCA Shift 2',
  department: 'Computer Applications',
  attendance: attendance[index] ?? 0,
  // Existing Nexa Learn screens can use this as a starting overall-progress value.
  progress: attendance[index] ?? 0
}));

const faculty = [
  { regNumber: 'FAC#200', name: 'Rajeshwari M', subject: 'C PROGRAMING' },
  { regNumber: 'FAC#201', name: 'Angel Vinoliya K', subject: 'ENGLISH' },
  { regNumber: 'FAC#202', name: 'Jayapal P', subject: 'TAMIL' },
  { regNumber: 'FAC#203', name: 'Anuradha A', subject: 'MATHS' },
  { regNumber: 'FAC#204', name: 'Ramesh Kumar B', subject: 'WEB THWCHNOLAGY' }
];

module.exports = { STUDENT_PASSWORD, FACULTY_PASSWORD, students, faculty };
