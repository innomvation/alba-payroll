// 알바 급여 공제 계산 로직 (아직 UI/DB 연결 안 됨 — 나중에 워커별 체크박스로 켤 예정)
//
// 알바 공제는 보통 둘 중 하나:
//   1) 4대보험 적용 — 정식 근로자로 국민연금·건강보험·장기요양보험·고용보험 공제
//      (산재보험은 사업주 100% 부담이라 근로자 공제 없음)
//   2) 3.3% 원천징수 — 사업소득자(프리랜서) 취급, 4대보험 미가입 대신 소득세+지방소득세만 뗌
//      (알바생에게 실무적으로 많이 쓰이는 방식)
//
// ⚠️ 요율은 매년 바뀜(특히 건강보험료율·장기요양보험료율). 아래 값은 2024~2025년 기준
//    공개된 일반적인 요율이고, 실제 적용 전에 최신 요율로 다시 확인/수정해야 함.

export const INSURANCE_RATES = {
  nationalPension: 0.045, // 국민연금 근로자 부담분 4.5%
  healthInsurance: 0.03545, // 건강보험 근로자 부담분 3.545%
  longTermCare: 0.1295, // 장기요양보험료율 — 건강보험료의 12.95% (건강보험료에 곱해서 계산)
  employmentInsurance: 0.009, // 고용보험 근로자 부담분 0.9%
}

export const WITHHOLDING_3_3_RATES = {
  incomeTax: 0.03, // 사업소득세(소득세) 3%
  localIncomeTax: 0.003, // 지방소득세(주민세) 0.3%
}

export type FourInsuranceBreakdown = {
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number
  totalDeduction: number
  netPay: number
}

export type WithholdingBreakdown = {
  incomeTax: number
  localIncomeTax: number
  totalDeduction: number
  netPay: number
}

const won = (n: number) => Math.round(n) // 원 단위 반올림

// 4대보험 적용 시 공제액/실수령액 계산
export function calcFourInsuranceDeduction(grossPay: number): FourInsuranceBreakdown {
  const nationalPension = won(grossPay * INSURANCE_RATES.nationalPension)
  const healthInsurance = won(grossPay * INSURANCE_RATES.healthInsurance)
  const longTermCare = won(healthInsurance * INSURANCE_RATES.longTermCare)
  const employmentInsurance = won(grossPay * INSURANCE_RATES.employmentInsurance)
  const totalDeduction = nationalPension + healthInsurance + longTermCare + employmentInsurance
  return {
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    totalDeduction,
    netPay: grossPay - totalDeduction,
  }
}

// 3.3% 원천징수 적용 시 공제액/실수령액 계산
export function calcWithholding3_3(grossPay: number): WithholdingBreakdown {
  const incomeTax = won(grossPay * WITHHOLDING_3_3_RATES.incomeTax)
  const localIncomeTax = won(grossPay * WITHHOLDING_3_3_RATES.localIncomeTax)
  const totalDeduction = incomeTax + localIncomeTax
  return {
    incomeTax,
    localIncomeTax,
    totalDeduction,
    netPay: grossPay - totalDeduction,
  }
}

export type DeductionMethod = 'none' | 'four_insurance' | 'withholding_3_3'

// 워커별 공제 방식에 따라 실수령액만 필요할 때 쓰는 통합 함수
export function calcNetPay(grossPay: number, method: DeductionMethod): number {
  if (method === 'four_insurance') return calcFourInsuranceDeduction(grossPay).netPay
  if (method === 'withholding_3_3') return calcWithholding3_3(grossPay).netPay
  return grossPay
}
