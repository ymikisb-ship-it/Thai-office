import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export const RATE = 4.2
export const CATEGORIES = ['給与','家賃','通信費','交通費','接待交際費','出張費','備品','その他'] as const
export const PAYMENT_METHODS = ['現金','法人カード','個人立替'] as const
export const ACTIVITY_TYPES = ['訪問','WEB会議','出張','電話','その他'] as const
