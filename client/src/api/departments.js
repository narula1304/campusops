import client from './client'

export const getDepartments = async () => {
    const res = await client.get('/departments')
    return res.data?.data
}

export const createDepartment = async (data) => {
    const res = await client.post('/departments', data)
    return res.data?.data
}

export const updateStrategy = async (id, strategy) => {
    const res = await client.patch(`/departments/${id}/strategy`, { strategy })
    return res.data?.data
}
